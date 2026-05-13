export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message)
    this.name = 'AuthError'
    // Required for correct instanceof checks when targeting ES5
    Object.setPrototypeOf(this, AuthError.prototype)
  }
}
