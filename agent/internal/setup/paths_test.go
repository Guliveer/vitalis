package setup

import "testing"

func TestParseMode(t *testing.T) {
	tests := []struct {
		input   string
		want    InstallMode
		wantErr bool
	}{
		{"system", ModeSystem, false},
		{"user", ModeUser, false},
		{"invalid", 0, true},
		{"", 0, true},
	}
	for _, tt := range tests {
		got, err := ParseMode(tt.input)
		if (err != nil) != tt.wantErr {
			t.Errorf("ParseMode(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
		}
		if got != tt.want {
			t.Errorf("ParseMode(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestResolvePaths_UserMode(t *testing.T) {
	p := ResolvePaths(ModeUser)
	if p.BinPath == "" {
		t.Error("BinPath should not be empty")
	}
	if p.ConfigPath == "" {
		t.Error("ConfigPath should not be empty")
	}
	if p.DataDir == "" {
		t.Error("DataDir should not be empty")
	}
}

func TestResolvePaths_SystemMode(t *testing.T) {
	p := ResolvePaths(ModeSystem)
	if p.BinPath == "" {
		t.Error("BinPath should not be empty")
	}
}
