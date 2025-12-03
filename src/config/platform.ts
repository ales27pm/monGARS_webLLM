import { Platform } from "react-native";

export const isWeb = Platform.OS === "web";
export const isTV = Boolean((Platform as typeof Platform & { isTV?: boolean }).isTV);
export const isCarPlay = false;
