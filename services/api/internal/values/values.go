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
// como NIT (9 dígitos), con o sin guiones ni espacios. Lo devuelve con el
// formato oficial: 0000-000000-000-0 o 00000000-0.
func OptionalNIT(p *string) (*string, bool) {
	if p == nil {
		return nil, true
	}
	var digits strings.Builder
	for _, c := range *p {
		switch {
		case c >= '0' && c <= '9':
			digits.WriteRune(c)
		case c == '-' || unicode.IsSpace(c):
		default:
			return nil, false
		}
	}
	d := digits.String()
	var v string
	switch len(d) {
	case 0:
		return nil, true
	case 9:
		sum := 0
		for i := 0; i < 8; i++ {
			sum += int(d[i]-'0') * (9 - i)
		}
		if int(d[8]-'0') != (10-sum%10)%10 {
			return nil, false
		}
		v = d[:8] + "-" + d[8:]
	case 14:
		v = d[:4] + "-" + d[4:10] + "-" + d[10:13] + "-" + d[13:]
	default:
		return nil, false
	}
	return &v, true
}
