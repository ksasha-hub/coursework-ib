#include "crypto.h"
#include <cstring>
#include <cstdlib>
#include <string>

std::string transform(const std::string& input, bool encrypt) {
    std::string output = input;
    char key = 0x5A; 
    for (size_t i = 0; i < input.length(); ++i) {
        if (encrypt) output[i] = (input[i] ^ key) + 1;
        else output[i] = (input[i] - 1) ^ key;
    }
    return output;
}

extern "C" {
    char* encrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string res = transform(std::string(input), true);
        char* out = (char*)malloc(res.length() + 1);
        strcpy(out, res.c_str());
        return out;
    }
    char* decrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string res = transform(std::string(input), false);
        char* out = (char*)malloc(res.length() + 1);
        strcpy(out, res.c_str());
        return out;
    }
    void free_string_ffi(char* ptr) {
        if (ptr) free(ptr);
    }
}
