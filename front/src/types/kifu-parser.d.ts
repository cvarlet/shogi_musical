declare module 'kifu-parser' {
  const kifuParser: (source: string, format?: 'Kif' | 'Ki2' | 'Csa', json?: boolean) => any;
  export default kifuParser;
}
