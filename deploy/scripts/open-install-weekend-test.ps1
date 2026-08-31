ssh -tt -i "$env:USERPROFILE\.ssh\tourflow_sakura_vps_ed25519" ubuntu@133.167.79.170 "bash -lc 'bash /home/ubuntu/jtw-test-deploy-dcdf1df-20260826/install-weekend-test.sh'"
Read-Host "部署完成后按 Enter 关闭"
