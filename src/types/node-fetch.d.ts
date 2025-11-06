declare module 'node-fetch' {
  type RequestInfo = any;
  function fetch(input: RequestInfo, init?: any): Promise<any>;
  export default fetch;
}
