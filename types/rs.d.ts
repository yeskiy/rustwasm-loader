declare module "*.rs" {
    // A `#[wasm_bindgen]` export reaches the default export as a function or, for
    // a struct, as a class. The floor stays loose until a `<name>.d.rs.ts`
    // sidecar overrides it, so each member accepts a call and a `new`.
    const mod: Record<
        string,
        ((...args: any[]) => any) & (new (...args: any[]) => any)
    >;
    export default mod;
}
