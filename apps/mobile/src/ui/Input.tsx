import { useRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { t } from "./theme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  left?: ReactNode;
  right?: ReactNode;
}

export function Input({ label, error, hint, left, right, style, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      ) : null}
      <View style={[styles.wrap, focused && styles.focused, !!error && styles.error]}>
        {left}
        <TextInput
          {...rest}
          placeholderTextColor={t.colors.inkFaint}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, style]}
          accessibilityLabel={label ?? rest.placeholder}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Six (or four) OTP boxes backed by one hidden input. */
export function OtpInput({ length = 6, value, onChange, error }: { length?: number; value: string; onChange: (v: string) => void; error?: string | null }) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.otpRow} accessibilityLabel="One time password">
        {Array.from({ length }).map((_, i) => {
          const active = focused && value.length === i;
          return (
            <View key={i} style={[styles.otpBox, active && styles.focused, !!error && styles.error]}>
              <Text variant="h2">{value[i] ?? ""}</Text>
            </View>
          );
        })}
        <TextInput
          ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
        autoFocus
        caretHidden
        accessibilityLabel="One time password input"
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border, borderRadius: 14, paddingHorizontal: 14, minHeight: 52, gap: 8 },
  focused: { borderColor: t.colors.gold },
  error: { borderColor: t.colors.danger },
  input: { flex: 1, fontSize: 16, color: t.colors.ink, paddingVertical: 12, outlineStyle: "none" } as any,
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: { flex: 1, aspectRatio: 0.85, maxWidth: 56, borderRadius: 14, borderWidth: 1.5, borderColor: t.colors.border, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center" },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, color: "transparent", fontSize: 1 },
});
