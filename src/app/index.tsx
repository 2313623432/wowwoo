import { Redirect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Image, StyleSheet, View } from "react-native";

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <Image
          source={require("../../assets/images/splash-icon.png")}
          style={styles.splashImage}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/chat" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#000",
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
});
