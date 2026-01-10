#include "crypto.h"
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <sstream>
#include <iomanip>

const char KEY = 0x5A;

// байты в хекс
std::string to_hex(const std::vector<unsigned char>& data) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (unsigned char c : data) ss << std::setw(2) << (int)c;
    return ss.str();
}

std::vector<unsigned char> from_hex(const std::string& hex) {
    std::vector<unsigned char> data;
    for (size_t i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        unsigned char byte = (unsigned char)strtol(byteString.c_str(), nullptr, 16);
        data.push_back(byte);
    }
    return data;
}

extern "C" {
    char* encrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string s_input(input);
        std::vector<unsigned char> encrypted;
        
        // хор шифрование
        for (char c : s_input) {
            unsigned char uc = (unsigned char)c;
            encrypted.push_back((uc ^ KEY) + 1);
        }

        std::string hex = to_hex(encrypted);
        char* out = (char*)malloc(hex.length() + 1);
        strcpy(out, hex.c_str());
        return out;
    }

    char* decrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string hex(input);
        std::vector<unsigned char> bytes = from_hex(hex);
        std::string decrypted;

        for (unsigned char c : bytes) {
            decrypted += (char)((c - 1) ^ KEY);
        }

        char* out = (char*)malloc(decrypted.length() + 1);
        strcpy(out, decrypted.c_str());
        return out;
    }

    void free_string_ffi(char* ptr) { if (ptr) free(ptr); }
}
