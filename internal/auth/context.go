package auth

import "context"

type contextKey string

const usernameKey contextKey = "username"

func ContextWithUsername(ctx context.Context, username string) context.Context {
	return context.WithValue(ctx, usernameKey, username)
}

func UsernameFromContext(ctx context.Context) (string, bool) {
	v, ok := ctx.Value(usernameKey).(string)
	return v, ok
}
