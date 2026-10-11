use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct ServerProcess(Mutex<Option<Child>>);

fn is_server_running() -> bool {
  if let Ok(addr) = "127.0.0.1:3000".parse() {
    TcpStream::connect_timeout(&addr, Duration::from_millis(600)).is_ok()
  } else {
    false
  }
}

fn try_start_server() -> Option<Child> {
  if is_server_running() {
    return None;
  }

  let candidates = [
    PathBuf::from("Start-TurboDownloader.bat"),
    PathBuf::from("../Start-TurboDownloader.bat"),
  ];

  for bat in candidates {
    if bat.exists() {
      let mut cmd = Command::new("cmd.exe");
      cmd.args(["/c", bat.to_str().unwrap_or("Start-TurboDownloader.bat")]);
      #[cfg(windows)]
      cmd.creation_flags(CREATE_NO_WINDOW);

      if let Ok(child) = cmd.spawn() {
        return Some(child);
      }
    }
  }

  let mut cmd = Command::new("cmd.exe");
  cmd.args(["/c", "npm run dev"]);
  #[cfg(windows)]
  cmd.creation_flags(CREATE_NO_WINDOW);
  cmd.spawn().ok()
}

fn get_default_downloads_dir() -> PathBuf {
  #[cfg(windows)]
  {
    if let Ok(profile) = std::env::var("USERPROFILE") {
      let dl = PathBuf::from(profile).join("Downloads");
      if dl.exists() {
        return dl;
      }
    }
  }
  let mut d = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
  d.push("downloads");
  if !d.exists() {
    let _ = std::fs::create_dir_all(&d);
  }
  d
}

#[tauri::command]
fn open_downloads_folder(path: Option<String>) -> Result<(), String> {
  let target = match path {
    Some(p) if !p.trim().is_empty() && p.trim() != "./downloads" => {
      let pb = PathBuf::from(p.trim());
      if pb.exists() {
        pb
      } else {
        get_default_downloads_dir()
      }
    }
    _ => get_default_downloads_dir(),
  };

  let target_str = target.to_string_lossy().to_string();

  #[cfg(windows)]
  {
    let _ = Command::new("explorer.exe")
      .arg(&target_str)
      .creation_flags(CREATE_NO_WINDOW)
      .spawn();
  }
  #[cfg(not(windows))]
  {
    let _ = Command::new("open").arg(&target_str).spawn();
  }
  Ok(())
}

#[tauri::command]
fn open_file_in_folder(filepath: String) -> Result<(), String> {
  #[cfg(windows)]
  {
    let target = PathBuf::from(&filepath);
    if target.exists() {
      let arg = format!("/select,{}", filepath);
      let _ = Command::new("explorer.exe")
        .arg(&arg)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    } else {
      let parent = target.parent().unwrap_or_else(|| std::path::Path::new("."));
      let _ = Command::new("explorer.exe")
        .arg(parent)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    }
  }
  #[cfg(not(windows))]
  {
    let _ = Command::new("open").arg(&filepath).spawn();
  }
  Ok(())
}

#[tauri::command]
async fn pick_folder<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  let folder = app.dialog().file().blocking_pick_folder();
  match folder {
    Some(f) => Ok(Some(f.to_string())),
    None => Ok(None),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      open_downloads_folder,
      open_file_in_folder,
      pick_folder
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let child = try_start_server();
      app.manage(ServerProcess(Mutex::new(child)));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      if let Some(state) = app_handle.try_state::<ServerProcess>() {
        if let Ok(mut guard) = state.0.lock() {
          if let Some(mut child) = guard.take() {
            let _ = child.kill();
          }
        }
      }
    }
  });
}
