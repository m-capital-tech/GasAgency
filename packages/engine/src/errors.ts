export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export const notFound = (what: string) => new EngineError("NOT_FOUND", `${what} not found`, 404);
