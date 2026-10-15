export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error("Unhandled API error", error);
  return Response.json(
    {
      success: false,
      code: "INTERNAL_ERROR",
      error: "خطای داخلی رخ داد. جزئیات در لاگ Cloudflare ثبت شد.",
    },
    { status: 500 },
  );
}
