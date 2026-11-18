package httpserver

import (
	"strings"
	"testing"
)

func TestNotificationLinkValidation(t *testing.T) {
	token := strings.Repeat("a", 43)
	for path, kind := range map[string]string{"/c/": "quote", "/estado/": "tracking", "/invitacion/": "invitation"} {
		got, tk, err := notificationLink(testOrigin, testOrigin+path+token)
		if err != nil || got != kind || tk != token {
			t.Fatalf("%s %s %v", got, tk, err)
		}
	}
	for _, link := range []string{"https://evil.test/c/" + token, testOrigin + "/c/" + token + "?x=1", testOrigin + "/c/" + token + "#x", testOrigin + "/c/short", testOrigin + "/unknown/" + token, "/c/" + token, testOrigin + "/c/%61" + token[1:]} {
		if _, _, err := notificationLink(testOrigin, link); err == nil {
			t.Fatalf("accepted %s", link)
		}
	}
}
