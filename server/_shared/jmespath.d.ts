declare module 'jmespath' {
  export function search(doc: unknown, expression: string): unknown;
  export function compile(expression: string): {
    search(doc: unknown): unknown;
  };
  const jmespath: {
    search: typeof search;
    compile: typeof compile;
  };
  export default jmespath;
}
