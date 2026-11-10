// Package values holds the input rules shared by every API feature.
package values

import (
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/nyaruka/phonenumbers"
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

// Phone valida un teléfono de cualquier país y lo normaliza a E.164.
// Los números sin código de país se interpretan como de El Salvador.
func Phone(s string) (string, bool) {
	n, err := phonenumbers.Parse(strings.TrimSpace(s), "SV")
	if err != nil || !phonenumbers.IsValidNumber(n) {
		return "", false
	}
	return phonenumbers.Format(n, phonenumbers.E164), true
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

func ValidYear(y *int32) bool { return y == nil || (*y >= 1886 && *y <= int32(time.Now().Year()+1)) }

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

func NormalizeEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func Email(s string) (string, bool) {
	s = NormalizeEmail(s)
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

var personNamePattern = regexp.MustCompile(`^[\p{L}\p{M}]+\.?(?:[ ’'-][\p{L}\p{M}]+\.?)*$`)
var vehicleTextPattern = regexp.MustCompile(`^[\p{L}\p{M}0-9 .’'&()+/-]+$`)
var vehicleContentPattern = regexp.MustCompile(`[\p{L}0-9]`)
var platePattern = regexp.MustCompile(`^[A-Z0-9]{3,12}$`)

func PersonName(s string) bool {
	n := utf8.RuneCountInString(s)
	return n >= 2 && n <= 100 && personNamePattern.MatchString(s)
}

func VehicleText(s string) bool {
	return utf8.RuneCountInString(s) <= 100 && vehicleTextPattern.MatchString(s) && vehicleContentPattern.MatchString(s)
}

func ValidPlate(p *string) bool {
	return p == nil || Plate(*p) == "" || platePattern.MatchString(Plate(*p))
}

// OptionalNIT acepta un NIT salvadoreño (14 dígitos) o un DUI homologado
// como NIT (9 dígitos), con o sin guiones. Lo guarda sin espacios.
func OptionalNIT(p *string) (*string, bool) {
	if p == nil {
		return nil, true
	}
	v := strings.Join(strings.Fields(*p), "")
	if v == "" {
		return nil, true
	}
	digits := 0
	for _, c := range v {
		switch {
		case c >= '0' && c <= '9':
			digits++
		case c != '-':
			return nil, false
		}
	}
	if digits != 9 && digits != 14 {
		return nil, false
	}
	return &v, true
}
