#ifndef CRYPTO_H
#define CRYPTO_H
extern "C" {
    char* encrypt_data_ffi(const char* input);
    char* decrypt_data_ffi(const char* input);
    void free_string_ffi(char* ptr);
}
#endif
