// Set test environment variables
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!!";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-at-least-32-chars!!";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
// NODE_ENV is set by Jest automatically — no need to assign it here
