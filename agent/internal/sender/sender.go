// Package sender implements the HTTP batch sender with retry logic.
// It marshals metric batches to JSON, compresses with gzip, and POSTs
// them to the API ingestion endpoint with exponential backoff on failure.
package sender

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/vitalis-app/agent/internal/buffer"
	"github.com/vitalis-app/agent/internal/config"
	"github.com/vitalis-app/agent/internal/models"
)

const (
	// maxRetries is the maximum number of retry attempts before buffering locally.
	maxRetries = 3

	// baseRetryDelay is the base delay for exponential backoff between retries.
	baseRetryDelay = 2 * time.Second

	// requestTimeout is the HTTP request timeout for each send attempt.
	requestTimeout = 10 * time.Second
)

// Sender handles batch transmission of metrics to the API with retry logic
// and local buffering as a fallback when the server is unreachable.
type Sender struct {
	client *http.Client
	cfg    *config.Config
	logger *zap.Logger
	buf    *buffer.Buffer
}

// New creates a new Sender with the given configuration, logger, and buffer.
func New(cfg *config.Config, logger *zap.Logger, buf *buffer.Buffer) *Sender {
	return &Sender{
		client: &http.Client{
			Timeout: requestTimeout,
		},
		cfg:    cfg,
		logger: logger,
		buf:    buf,
	}
}

// Send attempts to send a batch of metrics to the API.
// On failure after all retries, the batch is buffered locally for later transmission.
func (s *Sender) Send(metrics []models.MetricSnapshot) {
	batch := models.MetricBatch{
		MachineToken: s.cfg.Server.MachineToken,
		Metrics:      metrics,
	}

	data, err := json.Marshal(batch)
	if err != nil {
		s.logger.Error("Failed to marshal batch", zap.Error(err))
		return
	}

	// Compress with gzip
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	if _, err := gz.Write(data); err != nil {
		s.logger.Error("Failed to compress batch", zap.Error(err))
		s.bufferBatch(metrics)
		return
	}
	if err := gz.Close(); err != nil {
		s.logger.Error("Failed to finalize gzip compression", zap.Error(err))
		s.bufferBatch(metrics)
		return
	}

	// Retry loop with exponential backoff
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(math.Pow(2, float64(attempt-1))) * baseRetryDelay
			s.logger.Warn("Retrying send",
				zap.Int("attempt", attempt),
				zap.Duration("delay", delay))
			time.Sleep(delay)
		}

		err := s.doSend(compressed.Bytes())
		if err == nil {
			s.logger.Debug("Batch sent successfully", zap.Int("metrics", len(metrics)))
			return
		}

		// Rate limited — buffer immediately without further retries
		if isRateLimited(err) {
			s.logger.Warn("Rate limited by server, buffering batch", zap.Error(err))
			s.bufferBatch(metrics)
			return
		}

		s.logger.Warn("Send failed",
			zap.Int("attempt", attempt),
			zap.Error(err))
	}

	// All retries exhausted — buffer locally
	s.logger.Error("All retries exhausted, buffering batch")
	s.bufferBatch(metrics)
}

// doSend performs a single HTTP POST to the ingest endpoint.
func (s *Sender) doSend(compressedData []byte) error {
	url := fmt.Sprintf("%s/api/ingest", s.cfg.Server.URL)

	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		url,
		bytes.NewReader(compressedData),
	)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("Authorization", "Bearer "+s.cfg.Server.MachineToken)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	if resp.StatusCode == 429 {
		return &rateLimitError{statusCode: resp.StatusCode}
	}

	return fmt.Errorf("server returned %d", resp.StatusCode)
}

// bufferBatch stores a failed batch in the local file buffer.
func (s *Sender) bufferBatch(metrics []models.MetricSnapshot) {
	if s.buf == nil {
		s.logger.Warn("No buffer available, dropping metrics",
			zap.Int("count", len(metrics)))
		return
	}
	if err := s.buf.Store(metrics); err != nil {
		s.logger.Error("Failed to buffer metrics", zap.Error(err))
	}
}

// FlushBuffer attempts to send all previously buffered metrics.
// Called on startup to drain any batches that were stored during prior outages.
func (s *Sender) FlushBuffer() {
	if s.buf == nil {
		return
	}

	batches, err := s.buf.RetrieveAll()
	if err != nil {
		s.logger.Error("Failed to retrieve buffered metrics", zap.Error(err))
		return
	}

	if len(batches) == 0 {
		return
	}

	s.logger.Info("Flushing buffered metrics", zap.Int("batches", len(batches)))

	for _, batch := range batches {
		s.Send(batch)
	}
}

// rateLimitError indicates the server returned HTTP 429.
type rateLimitError struct {
	statusCode int
}

func (e *rateLimitError) Error() string {
	return fmt.Sprintf("rate limited (%d)", e.statusCode)
}

// isRateLimited checks whether an error is a rate limit response.
func isRateLimited(err error) bool {
	_, ok := err.(*rateLimitError)
	return ok
}
