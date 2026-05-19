import { expect, test } from 'vitest';
import bcrypt from 'bcryptjs';

test('Password hashing and validation is correct', async () => {
  const plainPassword = 'mypassword123';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  expect(hashedPassword).not.toBe(plainPassword);

  const isValid = await bcrypt.compare(plainPassword, hashedPassword);
  expect(isValid).toBe(true);

  const isInvalid = await bcrypt.compare('wrongpassword', hashedPassword);
  expect(isInvalid).toBe(false);
});
