declare module "*.rs" {
    const mod: Record<string, (...args: any[]) => any>;
    export default mod;
}
