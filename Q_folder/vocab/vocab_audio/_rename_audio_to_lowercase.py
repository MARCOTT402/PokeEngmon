import os

target_dir = r"C:\Users\user\Documents\trae_projects\PokeEngmon\Q_folder\vocab\vocab_audio"

def rename_audio_files_to_lowercase(directory):
    if not os.path.exists(directory):
        print(f"[-] 錯誤：找不到資料夾 {directory}")
        return

    print(f"[+] 正在掃描音訊資料夾：{directory}")
    files = os.listdir(directory)
    count = 0

    for filename in files:
        old_path = os.path.join(directory, filename)
        
        # 確保係檔案而非子資料夾
        if os.path.isfile(old_path):
            new_filename = filename.lower()
            new_path = os.path.join(directory, new_filename)
            
            if old_path != new_path:
                # 避免覆蓋已存在嘅同名檔案
                if os.path.exists(new_path):
                    print(f"[-] 略過：目標檔案已存在，無法重新命名 {filename} -> {new_filename}")
                    continue
                
                os.rename(old_path, new_path)
                print(f"  ✔ 重新命名：{filename} ➔ {new_filename}")
                count += 1

    print(f"[✔] 處理完成！總共有 {count} 個音訊檔案名稱被成功轉為細階。")

if __name__ == "__main__":
    rename_audio_files_to_lowercase(target_dir)