import { hashPassword, comparePassword } from "@/lib/auth/password";

describe("hashPassword", () => {
  it("returns a bcrypt hash string", async () => {
    const hash = await hashPassword("myPassword123");
    expect(typeof hash).toBe("string");
    // bcrypt hashes start with $2a$ or $2b$
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const hash1 = await hashPassword("samePassword");
    const hash2 = await hashPassword("samePassword");
    expect(hash1).not.toBe(hash2);
  });

  it("produces a hash with 12 rounds cost factor", async () => {
    const hash = await hashPassword("test");
    // bcrypt format: $2b$12$... where 12 is the cost factor
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
  });
});

describe("comparePassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correctPassword");
    const result = await comparePassword("correctPassword", hash);
    expect(result).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correctPassword");
    const result = await comparePassword("wrongPassword", hash);
    expect(result).toBe(false);
  });
});

describe("hashPassword and comparePassword round-trip", () => {
  it("works together for various passwords", async () => {
    const passwords = ["simple", "C0mpl3x!@#$%", "unicode-ñ-ü-ö", "   spaces   "];

    for (const password of passwords) {
      const hash = await hashPassword(password);
      const match = await comparePassword(password, hash);
      expect(match).toBe(true);

      const noMatch = await comparePassword(password + "x", hash);
      expect(noMatch).toBe(false);
    }
  });
});
