extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn square(n: u32) -> u32 {
    n * n
}
