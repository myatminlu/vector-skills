/**
 * Raised when the OS secure storage (Keychain / Keystore) rejects a write — for example a simulator build made
 * without a signing team, which has no keychain entitlement. Shown as "secure storage unavailable", never as
 * "wrong password".
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}
