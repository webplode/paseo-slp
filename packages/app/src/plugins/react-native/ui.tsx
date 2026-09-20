import { useCallback, useMemo, type ReactElement } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ComposerSelectAction, ComposerSelectProps } from "@getpaseo/plugin/client/ui";
import { AgentControlTrigger } from "@/composer/agent-controls/control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMenuContext } from "@/components/ui/menu";
import { isWeb } from "@/constants/platform";
import { resolvePluginIcon } from "../icons";

export {
  SettingsGroup,
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSwitch,
  SettingsSelect,
  SettingsInput,
  SettingsAction,
} from "@/components/settings";

function ComposerSelectTrigger({
  icon,
  label,
  displayValue,
  disabled,
  testID,
}: Pick<
  ComposerSelectProps,
  "icon" | "label" | "displayValue" | "disabled" | "testID"
>): ReactElement {
  const menu = useMenuContext("ComposerSelectTrigger");
  const Icon = useMemo(() => resolvePluginIcon(icon), [icon]);
  const { open, setOpen } = menu;
  const handlePress = useCallback(() => setOpen(!open), [open, setOpen]);
  const accessibilityState = useMemo(
    () => ({ expanded: open, disabled: Boolean(disabled) }),
    [disabled, open],
  );
  // Match MenuTrigger: React Native Web does not project expanded accessibility state.
  const webExpandedState = useMemo(() => (isWeb ? { "aria-expanded": open } : null), [open]);
  const accessibilityLabel = displayValue ? `${label}: ${displayValue}` : label;
  return (
    <AgentControlTrigger
      {...webExpandedState}
      ref={menu.triggerRef}
      icon={Icon}
      surface="toolbar"
      label={label}
      value={displayValue}
      showCaret
      open={open}
      disabled={disabled}
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      testID={testID}
    />
  );
}

function ComposerSelectOption<Value extends string>({
  option,
  selected,
  onValueChange,
}: {
  option: { label: string; value: Value };
  selected: boolean;
  onValueChange(value: Value): void;
}): ReactElement {
  const select = useCallback(() => onValueChange(option.value), [onValueChange, option.value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={select}>
      {option.label}
    </DropdownMenuItem>
  );
}

function ComposerSelectActionItem({ action }: { action: ComposerSelectAction }): ReactElement {
  const select = useCallback(() => action.onPress(), [action]);
  return (
    <DropdownMenuItem disabled={action.disabled} onSelect={select}>
      {action.label}
    </DropdownMenuItem>
  );
}

export function ComposerSelect<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  icon,
  displayValue,
  message,
  messageTone = "muted",
  action,
  disabled,
  testID,
}: ComposerSelectProps<Value>): ReactElement {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
  const resolvedDisplayValue = displayValue ?? selectedLabel;
  return (
    <DropdownMenu>
      <ComposerSelectTrigger
        icon={icon}
        label={label}
        displayValue={resolvedDisplayValue}
        disabled={disabled}
        testID={testID}
      />
      <DropdownMenuContent side="bottom" align="start" width={260}>
        {options.map((option) => (
          <ComposerSelectOption
            key={option.value}
            option={option}
            selected={option.value === value}
            onValueChange={onValueChange}
          />
        ))}
        {message || action ? <DropdownMenuSeparator /> : null}
        {message ? (
          <DropdownMenuLabel>
            <Text
              accessibilityRole={messageTone === "danger" ? "alert" : "text"}
              accessibilityLiveRegion={messageTone === "danger" ? "assertive" : "polite"}
              numberOfLines={3}
              style={messageTone === "danger" ? styles.messageDanger : styles.message}
            >
              {message}
            </Text>
          </DropdownMenuLabel>
        ) : null}
        {action ? <ComposerSelectActionItem action={action} /> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  message: { color: theme.colors.foregroundMuted },
  messageDanger: { color: theme.colors.statusDanger },
}));
