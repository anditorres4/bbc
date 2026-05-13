export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function handleError(err: unknown, res: { status: (n: number) => { json: (o: unknown) => unknown } }): unknown {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code })
  }
  console.error(err)
  return res.status(500).json({ error: 'Error interno del servidor' })
}
