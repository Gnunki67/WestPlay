//! Native controller buttons, shared by the companion's recorder and the game plugin.
//! WinMM works in the background, including when the game's window owns input.
//! Codes fit the existing bridge key field; 1..254 remain Windows virtual keys.

pub const BASE: u32 = 0x1000;
pub const DEVICES: u32 = 16;
pub const BUTTONS: u32 = 36; // 32 buttons plus the four POV directions

pub fn decode(code: u32) -> Option<(u32, u32)> {
    let value = code.checked_sub(BASE)?;
    let (device, button) = (value / 64, value % 64);
    (device < DEVICES && button < BUTTONS).then_some((device, button))
}

pub fn name(code: u32) -> Option<String> {
    let (device, button) = decode(code)?;
    let control = if button < 32 {
        format!("Button {}", button + 1)
    } else {
        format!("POV {}", ["↑", "→", "↓", "←"][(button - 32) as usize])
    };
    Some(format!("Controller {} · {control}", device + 1))
}

#[repr(C)]
#[derive(Default)]
struct JoyInfo {
    size: u32,
    flags: u32,
    x: u32,
    y: u32,
    z: u32,
    r: u32,
    u: u32,
    v: u32,
    buttons: u32,
    button_number: u32,
    pov: u32,
    reserved: [u32; 2],
}

#[link(name = "winmm")]
unsafe extern "system" {
    fn joyGetPosEx(id: u32, info: *mut JoyInfo) -> u32;
}

fn read(device: u32) -> u64 {
    let mut info = JoyInfo { size: size_of::<JoyInfo>() as u32, flags: 0x80 | 0x40 | 0x200, ..Default::default() };
    // SAFETY: `info` has the WinMM JOYINFOEX layout, size, and lifetime for this synchronous query.
    if unsafe { joyGetPosEx(device, &mut info) } != 0 {
        return 0;
    }
    let mut mask = u64::from(info.buttons);
    if info.pov < 36000 {
        // Diagonals press both adjacent directions; 0xffff means centred.
        let direction = ((info.pov + 2250) / 4500) % 8;
        let first = direction / 2;
        mask |= 1u64 << (32 + first);
        if direction % 2 == 1 {
            mask |= 1u64 << (32 + (first + 1) % 4);
        }
    }
    mask
}

pub fn down(code: u32) -> bool {
    decode(code).is_some_and(|(device, button)| read(device) & (1u64 << button) != 0)
}

/// Currently held buttons, for recording. Disconnected devices return no buttons.
pub fn pressed() -> Vec<u32> {
    let mut result = Vec::new();
    for device in 0..DEVICES {
        let mask = read(device);
        for button in 0..BUTTONS {
            if mask & (1u64 << button) != 0 {
                result.push(BASE + device * 64 + button);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_do_not_overlap_keys_or_invalid_controller_slots() {
        assert_eq!(decode(0xa4), None);
        assert_eq!(decode(BASE + 15 * 64 + 35), Some((15, 35)));
        assert_eq!(decode(BASE + 36), None);
        assert_eq!(decode(BASE + 16 * 64), None);
        assert_eq!(name(BASE).as_deref(), Some("Controller 1 · Button 1"));
    }
}
