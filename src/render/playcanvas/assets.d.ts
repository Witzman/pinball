// Image files imported by the PlayCanvas renderer come out of the bundler as URLs (#45).
declare module "*.webp" {
  const url: string;
  export default url;
}
