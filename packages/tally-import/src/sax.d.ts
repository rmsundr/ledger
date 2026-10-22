declare module 'sax' {
  export interface Tag {
    name: string;
    attributes: Record<string, string>;
    isSelfClosing: boolean;
  }

  export interface SAXParser {
    onopentag: (tag: Tag) => void;
    onclosetag: (tagName: string) => void;
    ontext: (text: string) => void;
    oncdata: (cdata: string) => void;
    onerror: (err: Error) => void;
    write: (chunk: string) => SAXParser;
    close: () => SAXParser;
  }

  export function parser(strict: boolean, opt?: { trim?: boolean; lowercase?: boolean }): SAXParser;
  const sax: { parser: typeof parser };
  export default sax;
}
