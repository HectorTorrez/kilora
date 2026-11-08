package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

const (
	SessionCookie        = "kilora_session"
	SessionTTL           = 30 * 24 * time.Hour
	SessionTouchInterval = time.Hour

	MinPasswordLength = 8

	argonMemoryKiB = 64 * 1024
	argonTime      = 3
	argonThreads   = 2
	argonKeyLength = 32
	saltLength     = 16
)

const (
	DemoEmailDomain   = "demo.kilora.app"
	DemoPassword      = "demo1234"
	DemoWorkshopEmail = "taller@" + DemoEmailDomain
	DemoOwnerEmail    = "propietario@" + DemoEmailDomain
	DemoRivalEmail    = "ceiba@" + DemoEmailDomain
)

func IsDemoEmail(email string) bool {
	return strings.HasSuffix(strings.ToLower(email), "@"+DemoEmailDomain)
}

func HashPassword(password string) (string, error) {
	if len([]rune(password)) < MinPasswordLength {
		return "", fmt.Errorf("la contraseña debe tener al menos %d caracteres", MinPasswordLength)
	}
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemoryKiB, argonTime, argonThreads, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil || m != argonMemoryKiB || t != argonTime || p != argonThreads {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) != 16 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) != 32 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, t, m, p, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}
func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// NewTokenPair returns a token for the user and the hash the database stores.
func NewTokenPair() (token, hash string, err error) {
	token, err = NewToken()
	if err != nil {
		return "", "", err
	}
	return token, HashToken(token), nil
}

func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
