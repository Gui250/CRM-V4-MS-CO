/** Single place the frontend reports unexpected errors; swap for a real sink later. */
export function reportError(error: unknown, context: string): void {
  console.error(`[${context}]`, error)
}
