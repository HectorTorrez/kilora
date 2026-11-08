package httpserver

import (
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
	"kilora/api/internal/values"
)

func timestamptz(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }
func date(t time.Time) pgtype.Date               { return pgtype.Date{Time: t, Valid: true} }

func nullableTime(v pgtype.Timestamptz) *time.Time {
	if !v.Valid {
		return nil
	}
	return &v.Time
}

func nullableDate(v pgtype.Date) *string {
	if !v.Valid {
		return nil
	}
	s := v.Time.Format(values.DateLayout)
	return &s
}

func dbNumeric(d decimal.Decimal) pgtype.Numeric {
	var n pgtype.Numeric
	if err := n.Scan(d.StringFixed(2)); err != nil {
		panic(err)
	}
	return n
}

func numericText(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	v, err := n.Value()
	if err != nil {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		return nil
	}
	return &s
}

func amount(n pgtype.Numeric) decimal.Decimal {
	s := numericText(n)
	if s == nil {
		return decimal.Zero
	}
	d, err := decimal.NewFromString(*s)
	if err != nil {
		return decimal.Zero
	}
	return d
}

func fixedAmount(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	s := amount(n).StringFixed(2)
	return &s
}

func rawAmountText(raw json.RawMessage) (string, bool) {
	s := string(raw)
	if len(s) > 0 && s[0] == '"' {
		if json.Unmarshal(raw, &s) != nil {
			return "", false
		}
	}
	return s, true
}

func isAbsent(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

func optionalMoney(raw json.RawMessage) (pgtype.Numeric, bool) {
	if isAbsent(raw) {
		return pgtype.Numeric{}, true
	}
	return requiredMoney(raw)
}

func requiredMoney(raw json.RawMessage) (pgtype.Numeric, bool) {
	s, ok := rawAmountText(raw)
	if !ok {
		return pgtype.Numeric{}, false
	}
	d, ok := values.Money(s)
	if !ok {
		return pgtype.Numeric{}, false
	}
	return dbNumeric(d), true
}

func requiredQuantity(raw json.RawMessage) (pgtype.Numeric, bool) {
	s, ok := rawAmountText(raw)
	if !ok {
		return pgtype.Numeric{}, false
	}
	d, ok := values.Quantity(s)
	if !ok {
		return pgtype.Numeric{}, false
	}
	return dbNumeric(d), true
}
