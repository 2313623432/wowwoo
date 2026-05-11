import {
  Modal,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreateGroup?: () => void;
  onCreateAgent?: () => void;
};

export function CreateModal({
  visible,
  onClose,
  onCreateGroup,
  onCreateAgent,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>✨ 创建 ✨</Text>
          <TouchableOpacity
            style={styles.btnGroup}
            onPress={onCreateGroup}
            activeOpacity={0.8}
          >
            <Ionicons name="people" size={24} color="#fff" />
            <Text style={styles.btnGroupText}>创建群聊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnAgent}
            onPress={onCreateAgent}
            activeOpacity={0.8}
          >
            <Ionicons name="hardware-chip-outline" size={24} color="#fff" />
            <Text style={styles.btnAgentText}>创建智能体</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelWrap}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowLight,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.navTitlePink,
    marginBottom: 20,
  },
  btnGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.wechatGreen,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: theme.radiusMd,
    width: "100%",
    marginBottom: 12,
  },
  btnGroupText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  btnAgent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.pink,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: theme.radiusMd,
    width: "100%",
    marginBottom: 16,
  },
  btnAgentText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  cancelWrap: {
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
});
