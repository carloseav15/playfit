declare module "papaparse" {
  export interface ParseError {
    message: string;
  }

  export interface ParseMeta {
    fields?: string[];
  }

  export interface ParseConfig<T> {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    transformHeader?: (header: string) => string;
    transform?: (value: string, field?: string | number) => string;
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface PapaStatic {
    parse<T>(input: string, config: ParseConfig<T>): ParseResult<T>;
  }

  const Papa: PapaStatic;
  export default Papa;
}
