/** Retry only transactions known to have rolled back. Uploads stay outside. */
export async function withLpTransactionRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
