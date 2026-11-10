// Zod স্কিমা: z.object({ body?, query?, params? })
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) return next(result.error);

  const { body, query, params } = result.data;
  if (body !== undefined) req.body = body;
  if (params !== undefined) req.params = params;
  if (query !== undefined) {
    Object.defineProperty(req, 'query', {
      configurable: true,
      enumerable: true,
      value: query,
    });
  }
  next();
};