// Vercel invokes Express directly. Never call listen() or close shared pools
// after each request: concurrent requests and domain transactions share them.
export { default } from "./app";
