// Package values holds the input rules shared by every API feature.
package values

import (
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/shopspring/decimal"
)

const (
	Currency   = "USD"
	DateLayout = "2006-01-02"
)

// El Salvador does not observe daylight saving, so a fixed offset is exact and needs no tzdata.
var Location = time.FixedZone("America/El_Salvador", -6*60*60)

func Today() time.Time {
	now := time.Now().In(Location)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func PastDate(s string) (time.Time, bool) {
	d, err := time.Parse(DateLayout, s)
	if err != nil || d.After(Today()) {
		return time.Time{}, false
	}
	return d, true
}

func stripSeparators(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' {
			return -1
		}
		return r
	}, s)
}

func Plate(s string) string { return strings.ToUpper(stripSeparators(s)) }

func OptionalPlate(p *string) *string {
	if p == nil {
		return nil
	}
	v := Plate(*p)
	if v == "" {
		return nil
	}
	return &v
}

func Phone(s string) (string, bool) {
	s = stripSeparators(s)
	if strings.HasPrefix(s, "+503") {
		s = s[4:]
	} else if strings.HasPrefix(s, "503") && len(s) == 11 {
		s = s[3:]
	}
	if len(s) != 8 {
		return "", false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return "", false
		}
	}
	return "+503" + s, true
}

func OptionalPhone(p *string) (*string, bool) {
	if p == nil || strings.TrimSpace(*p) == "" {
		return nil, true
	}
	v, ok := Phone(*p)
	if !ok {
		return nil, false
	}
	return &v, true
}

func ValidYear(y *int32) bool { return y == nil || (*y >= 1886 && *y <= 2100) }

func OptionalText(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func Email(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	a, err := mail.ParseAddress(s)
	return s, err == nil && a.Address == s
}

var amountPattern = regexp.MustCompile(`^[0-9]+(?:\.[0-9]{1,2})?$`)

func parseAmount(s string, maxIntegerDigits int) (decimal.Decimal, bool) {
	if !amountPattern.MatchString(s) || len(strings.TrimLeft(strings.Split(s, ".")[0], "0")) > maxIntegerDigits {
		return decimal.Zero, false
	}
	d, err := decimal.NewFromString(s)
	return d, err == nil
}

func Money(s string) (decimal.Decimal, bool) { return parseAmount(s, 10) }

func Quantity(s string) (decimal.Decimal, bool) {
	d, ok := parseAmount(s, 8)
	return d, ok && d.IsPositive()
}

func LineTotal(quantity, price decimal.Decimal) decimal.Decimal {
	return quantity.Mul(price).Round(2)
}
