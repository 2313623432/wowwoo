import {
  Modal,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { theme } from "@/constants/theme";
import { Mascot } from "@/components/Mascot";

const DEFAULT_MESSAGE =
  "感谢姐妹的支持！主包爆肝中....敬请期待\n（最迟2026年4月上线）";

/** 朋友圈「开发中」弹窗专用文案 */
export const MOMENTS_MESSAGE =
  "因为是一个人在肝，工作量真的顶满，朋友圈功能先暂时只开放默认人物啦。\n比起赶速度，我更想把质感和体验做好，不敷衍大家。全部人物的朋友圈，我会抓紧在2026年4月前全部更完！\n真的非常感谢大家的耐心和理解，给大家滑跪道歉啦～";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 不传则使用默认通用文案；朋友圈页传 MOMENTS_MESSAGE */
  message?: string;
};

export function ComingSoonModal({ visible, onClose, message }: Props) {
  const displayMessage = message ?? DEFAULT_MESSAGE;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* <Mascot size={120} style={styles.mascot} /> */}
          <Text style={styles.title}>✨ 敬请期待 ✨</Text>
          <Text style={styles.message}>{displayMessage}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>知道啦</Text>
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
    borderRadius: 32,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.pinkLight,
    ...theme.shadowLight,
  },
  mascot: {
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.navTitlePink,
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.textPrimary,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: theme.btnPrimaryBg,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 40,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: theme.pink,
    fontSize: 14,
  },
});
