/** Fixed, public-safe failure vocabulary. Never attach a filesystem or crypto error. */
const FAILURES = Object.freeze({
  INVALID_IDENTITIES: ['address-mismatch', 'Choose local network addresses or a .local hostname.'],
  INVALID_CONFIGURATION: ['failed', 'The secure listener configuration is invalid.'],
  MATERIAL_MISSING: ['needs-setup', 'Set up secure phone access on the host first.'],
  MATERIAL_INVALID: ['failed', 'The saved certificate material could not be validated.'],
  CERTIFICATE_EXPIRED: ['certificate-expired', 'The certificate has expired. Refresh it on the host.'],
  CERTIFICATE_NOT_YET_VALID: ['failed', 'Check the host clock before using secure phone access.'],
  ADDRESS_MISMATCH: ['address-mismatch', 'Refresh the certificate for the current local addresses.'],
  ROOT_REPLACEMENT_REQUIRED: ['failed', 'The installation root needs explicit replacement and new phone trust.'],
  STORAGE_UNSAFE: ['failed', 'Private certificate storage needs attention on the host.'],
  STORAGE_UNAVAILABLE: ['failed', 'Private certificate storage is unavailable.'],
  STORE_BUSY: ['failed', 'Another host operation is using certificate storage. Close it and retry.'],
  PROVISION_FAILED: ['failed', 'Secure phone setup could not be completed. Touch play remains available.'],
});

export class SecureLanCertificateError extends Error {
  constructor(code, { rootReplacementRequired = false } = {}) {
    const safeCode = Object.hasOwn(FAILURES, code) ? code : 'MATERIAL_INVALID';
    const [status, message] = FAILURES[safeCode];
    super(message);
    this.name = 'SecureLanCertificateError';
    this.code = safeCode;
    this.status = status;
    this.rootReplacementRequired = Boolean(rootReplacementRequired);
  }

  toJSON() {
    return { code: this.code, status: this.status, message: this.message };
  }
}

export function certificateError(code, options) {
  return new SecureLanCertificateError(code, options);
}

export function safeCertificateError(error, fallback = 'MATERIAL_INVALID') {
  return error instanceof SecureLanCertificateError ? error : certificateError(fallback);
}
