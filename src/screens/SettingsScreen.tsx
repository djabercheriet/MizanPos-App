import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { Button } from '../components/Button';
import { Card, InfoRow } from '../components/Card';
import { ScreenShell } from '../components/ScreenShell';
import { StatusPill, toneForStatus } from '../components/StatusPill';
import { TextField } from '../components/TextField';
import { LANGUAGE_NAMES } from '../i18n';
import { useApp } from '../state/AppContext';
import type { LanguageCode } from '../storage/preferences';
import { fontSize, fontWeight, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const LANGUAGES: LanguageCode[] = ['en', 'ar', 'fr'];

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.accentDark }}
        thumbColor={value ? colors.accent : colors.textFaint}
      />
    </View>
  );
}

export function SettingsScreen(): React.JSX.Element {
  const {
    t,
    pairing,
    status,
    language,
    preferences,
    updatePreferences,
    deviceName,
    updateDeviceName,
  } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [nameDraft, setNameDraft] = useState(deviceName);

  useEffect(() => {
    setNameDraft(deviceName);
  }, [deviceName]);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScreenShell
      title={t('settings.title')}
      right={<StatusPill label={t(`scanner.status.${status.status}` as 'scanner.status.idle')} tone={toneForStatus(status.status)} />}
      scroll
      bottomInset={false}
    >
      {status.status === 'revoked' ? (
        <Card style={styles.revokedCard}>
          <Text style={styles.revokedText}>{t('settings.revokedBody')}</Text>
        </Card>
      ) : null}

      <Card title={t('settings.terminal')}>
        {pairing ? (
          <>
            <InfoRow label={t('settings.deviceName')} value={status.desktopName || '—'} />
            <InfoRow label={t('settings.address')} value={`${pairing.host}:${pairing.port}`} />
            <InfoRow label={t('settings.fingerprint')} value={pairing.fingerprint} />
            <InfoRow
              label={t('settings.pairedAt')}
              value={new Date(pairing.pairedAt).toLocaleString()}
            />
          </>
        ) : (
          <Text style={styles.muted}>{t('welcome.notPaired')}</Text>
        )}
      </Card>

      <Card title={t('settings.deviceName')}>
        <TextField
          value={nameDraft}
          onChangeText={setNameDraft}
          maxLength={64}
          autoCorrect={false}
          placeholder={t('settings.deviceName')}
          hint={t('settings.deviceNameHint')}
        />
        <Button
          label={t('settings.save')}
          variant="secondary"
          disabled={nameDraft.trim().length === 0 || nameDraft.trim() === deviceName}
          onPress={() => void updateDeviceName(nameDraft.trim())}
          style={styles.cardAction}
        />
      </Card>

      <Card title={t('settings.theme')}>
        <View style={styles.optionRow}>
          <Button
            label={t('settings.themeDark')}
            variant={preferences.theme === 'dark' ? 'primary' : 'secondary'}
            onPress={() => updatePreferences({ theme: 'dark' })}
            style={styles.optionButton}
          />
          <Button
            label={t('settings.themeLight')}
            variant={preferences.theme === 'light' ? 'primary' : 'secondary'}
            onPress={() => updatePreferences({ theme: 'light' })}
            style={styles.optionButton}
          />
        </View>
      </Card>

      <Card title={t('settings.appearance')}>
        <Text style={styles.fieldLabel}>{t('settings.language')}</Text>
        <View style={styles.optionRow}>
          {LANGUAGES.map((code) => (
            <Button
              key={code}
              label={LANGUAGE_NAMES[code]}
              variant={language === code ? 'primary' : 'secondary'}
              onPress={() => updatePreferences({ language: code })}
              style={styles.optionButton}
            />
          ))}
        </View>
        <ToggleRow
          label={t('settings.haptics')}
          value={preferences.hapticsEnabled}
          onChange={(next) => updatePreferences({ hapticsEnabled: next })}
        />
        <ToggleRow
          label={t('settings.sound')}
          value={preferences.soundEnabled}
          onChange={(next) => updatePreferences({ soundEnabled: next })}
        />
        <ToggleRow
          label={t('settings.keepAwake')}
          value={preferences.keepAwake}
          onChange={(next) => updatePreferences({ keepAwake: next })}
        />
        <ToggleRow
          label={t('settings.torchDefault')}
          value={preferences.torchDefault}
          onChange={(next) => updatePreferences({ torchDefault: next })}
        />
      </Card>

      <Card title={t('settings.about')}>
        <InfoRow label={t('settings.version')} value={version} />
        <InfoRow label={t('settings.terminal')} value={pairing ? pairing.deviceId.slice(0, 14) : '—'} />
      </Card>
    </ScreenShell>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    muted: { color: colors.textMuted, fontSize: fontSize.sm },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
    },
    cardAction: { marginTop: spacing.sm },
    optionRow: { flexDirection: 'row', columnGap: spacing.sm, marginBottom: spacing.md },
    optionButton: { flex: 1, paddingHorizontal: spacing.sm },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    toggleLabel: { color: colors.text, fontSize: fontSize.md, flexShrink: 1 },
    revokedCard: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    revokedText: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20 },
  });
}
