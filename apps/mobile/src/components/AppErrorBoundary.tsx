import { Ionicons } from "@expo/vector-icons";
import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { Button, Text, t } from "@/ui";

interface State {
  error: Error | null;
}

/** Last line of defence: a JS error shows a friendly screen with Reload instead of a red box / blank app. */
export class AppErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[Munna Gas Connect] uncaught render error", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: t.colors.bg, gap: 10 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.dangerSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="warning-outline" size={30} color={t.colors.danger} />
        </View>
        <Text variant="h2" center>
          Something went wrong
        </Text>
        <Text variant="small" tone="muted" center>
          {this.state.error.message}
        </Text>
        <Button
          title="Reload app"
          icon="refresh"
          full={false}
          style={{ marginTop: 10 }}
          onPress={() => {
            this.props.onReset?.();
            this.setState({ error: null });
          }}
        />
      </View>
    );
  }
}
