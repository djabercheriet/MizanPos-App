/**
 * MIZANE Mobile Scanner — icon set.
 *
 * Drawn entirely with React Native views: the project deliberately ships no
 * icon font or vector library, so every glyph stays dependency-free and scales
 * from the `size` prop. Colour is always supplied by the caller so icons follow
 * the active theme.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

export type IconName = 'home' | 'scanner' | 'history' | 'devices' | 'settings' | 'flash' | 'close';

interface IconProps {
  name: IconName;
  color: string;
  size?: number;
}

export function Icon({ name, color, size = 22 }: IconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(size * 0.09));

  switch (name) {
    // Roof + body: reads as a home silhouette at tab-bar sizes.
    case 'home':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.44,
              borderRightWidth: size * 0.44,
              borderBottomWidth: size * 0.42,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
            }}
          />
          <View
            style={{
              width: size * 0.58,
              height: size * 0.34,
              marginTop: -size * 0.03,
              backgroundColor: color,
              borderBottomLeftRadius: size * 0.12,
              borderBottomRightRadius: size * 0.12,
            }}
          />
        </View>
      );

    // Barcode bars — the same motif used on the home hero.
    case 'scanner':
      return (
        <View
          style={[
            styles.box,
            {
              width: size,
              height: size,
              flexDirection: 'row',
              columnGap: size * 0.08,
            },
          ]}
        >
          {[0.34, 0.62, 0.26, 0.7, 0.4].map((height, index) => (
            <View
              key={index}
              style={{
                width: stroke,
                height: size * height,
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      );

    // Stacked log lines.
    case 'history':
      return (
        <View
          style={[
            styles.box,
            {
              width: size,
              height: size,
              alignItems: 'flex-start',
              justifyContent: 'center',
              rowGap: size * 0.15,
              paddingHorizontal: size * 0.16,
            },
          ]}
        >
          {[0.72, 1, 0.86].map((width, index) => (
            <View
              key={index}
              style={{
                width: size * 0.68 * width,
                height: stroke,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      );

    // Paired terminal silhouette.
    case 'devices':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.54,
              height: size * 0.86,
              borderRadius: size * 0.16,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingBottom: size * 0.07,
            }}
          >
            <View
              style={{
                width: size * 0.18,
                height: stroke,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      );

    // Sliders — knobs at staggered positions distinguish it from the log icon.
    case 'settings':
      return (
        <View
          style={[
            styles.box,
            {
              width: size,
              height: size,
              alignItems: 'center',
              justifyContent: 'center',
              rowGap: size * 0.04,
              paddingHorizontal: size * 0.12,
            },
          ]}
        >
          {[0.7, 0.28, 0.55].map((knobPosition, index) => (
            <View
              key={index}
              style={{
                width: '100%',
                height: size * 0.32,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  start: 0,
                  end: 0,
                  height: stroke,
                  borderRadius: 2,
                  backgroundColor: color,
                  opacity: 0.55,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  start: (size * 0.76 - size * 0.3) * knobPosition,
                  width: size * 0.3,
                  height: size * 0.3,
                  borderRadius: size * 0.15,
                  backgroundColor: color,
                }}
              />
            </View>
          ))}
        </View>
      );

    // Lightning bolt for the torch control: two offset slanted bars.
    case 'flash':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          {[-1, 1].map((direction) => (
            <View
              key={direction}
              style={{
                position: 'absolute',
                width: size * 0.3,
                height: size * 0.52,
                borderRadius: 2,
                backgroundColor: color,
                transform: [
                  { translateX: size * 0.07 * direction },
                  { translateY: size * 0.13 * direction },
                  { rotate: '22deg' },
                ],
              }}
            />
          ))}
        </View>
      );

    case 'close':
    default:
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          {['45deg', '-45deg'].map((angle) => (
            <View
              key={angle}
              style={{
                position: 'absolute',
                width: size * 0.68,
                height: stroke,
                borderRadius: 2,
                backgroundColor: color,
                transform: [{ rotate: angle }],
              }}
            />
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
