import { useState } from "react";
import { View } from "react-native";
import { DropCard } from "@/components/DropCard";
import { useMyDrops } from "@/features/delivery";
import { Chip, EmptyState, ErrorState, Row, Screen, SkeletonList, Text } from "@/ui";

/** D2 — Drop list, ordered by route */
export default function DropsScreen() {
  const { staff, drops, pending, done } = useMyDrops();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const list = tab === "pending" ? pending : done;
  return (
    <Screen title="Today's drops" subtitle={`${pending.length} pending · ${done.length} completed`} tabBar refreshing={drops.isRefetching} onRefresh={() => drops.refetch()}>
      <Row gap={8} style={{ marginBottom: 14 }}>
        <Chip label={`Pending (${pending.length})`} active={tab === "pending"} onPress={() => setTab("pending")} />
        <Chip label={`Completed (${done.length})`} active={tab === "done"} onPress={() => setTab("done")} />
      </Row>
      {drops.isLoading ? (
        <SkeletonList count={4} />
      ) : drops.isError ? (
        <ErrorState onRetry={() => drops.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={tab === "pending" ? "bicycle-outline" : "checkmark-done-outline"} title={tab === "pending" ? "No pending drops" : "Nothing completed yet"} body={tab === "pending" ? "Assignments from the agency will show up here in route order." : "Delivered and failed drops from today appear here."} />
      ) : (
        <View style={{ gap: 10 }}>
          {tab === "pending" ? (
            <Text variant="caption" tone="faint">
              Sorted by shortest route from your location
            </Text>
          ) : null}
          {list.map((b, i) => (
            <DropCard key={b.id} b={b} index={i + 1} from={staff.data?.currentLocation} />
          ))}
        </View>
      )}
    </Screen>
  );
}
