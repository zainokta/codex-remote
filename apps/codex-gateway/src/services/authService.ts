import crypto from 'node:crypto'

export class AuthService {
  private readonly password: string
  private readonly issued = new Map<string, number>()

  constructor(password: string) {
    this.password = password
  }

  login(password: string) {
    if (password !== this.password) {
      throw new Error('Invalid password')
    }

    const token = crypto.randomBytes(24).toString('base64url')
    this.issued.set(token, Date.now() + 1000 * 60 * 60 * 12)
    return token
  }

  verify(token: string | undefined | null) {
    if (!token) return false
    const expiresAt = this.issued.get(token)
    if (!expiresAt) return false
    if (expiresAt < Date.now()) {
      this.issued.delete(token)
      return false
    }
    return true
  }

  hint() {
    return `${this.password.slice(0, 4)}••••${this.password.slice(-4)}`
  }
}
