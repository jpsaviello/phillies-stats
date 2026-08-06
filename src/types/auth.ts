// The signed-in user as the backend exposes it. Deliberately minimal — the
// password hash and session rows never leave the server.
export interface User {
  id: string
  email: string
}
