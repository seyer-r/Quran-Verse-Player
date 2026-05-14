import { Text, TextStyle } from "react-native";

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
};

export function MarqueeText({ children, style }: Props) {
  return (
    <Text style={style} numberOfLines={1} ellipsizeMode="tail">
      {children}
    </Text>
  );
}
