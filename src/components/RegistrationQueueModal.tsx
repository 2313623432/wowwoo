import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { theme } from "@/constants/theme";
import { buildRegistrationQueueCopy } from "@/utils/registrationQueue";

type Props = {
  visible: boolean;
  untilText?: string | null;
  registerUsers?: number | null;
  /** 排队总人数，与 queuePosition 一起时在第一行展示 */
  queueTotal?: number | null;
  /** 当前用户的排队位置 */
  queuePosition?: number | null;
  onClose: () => void;
};

export function RegistrationQueueModal({
  visible,
  untilText,
  registerUsers,
  queueTotal,
  queuePosition,
  onClose,
}: Props) {
  const copy = buildRegistrationQueueCopy(
    untilText?.trim() || "稍后",
    queueTotal,
    queuePosition,
  );
  const showQueueMeta =
    typeof queueTotal === "number" && typeof queuePosition === "number";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>注册排队中</Text>
          {showQueueMeta ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                排队总人数：{queueTotal}，你排在第{queuePosition}位
              </Text>
            </View>
          ) : typeof registerUsers === "number" ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>当前注册任务：{registerUsers}</Text>
            </View>
          ) : null}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.copy}>{copy}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>我知道啦</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 18,
    width: "100%",
    maxWidth: 360,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowLight,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.navTitlePink,
    textAlign: "center",
    marginBottom: 12,
  },
  metaRow: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    marginBottom: 10,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  bodyScroll: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: 6,
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.textPrimary,
  },
  actions: {
    marginTop: 14,
  },
  primaryBtn: {
    backgroundColor: theme.btnPrimaryBg,
    borderRadius: theme.radiusMd,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
