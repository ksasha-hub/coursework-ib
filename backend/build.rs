fn main() {
    println!("cargo:rerun-if-changed=../crypto-lib/src/crypto.cpp");
    cc::Build::new()
        .cpp(true)
        .file("../crypto-lib/src/crypto.cpp")
        .compile("cryptolib");
}
