#include<stdio.h>
#include<string.h>
#include<winsock2.h>

#pragma comment(lib,"ws2_32.lib")


int main(){
    WSADATA wsa;
    SOCKET sock;
    struct sockaddr_in server;

    char msg[1024];
    char buffer[1024];
    WSAStartup (MAKEWORD(2,2),&wsa);
    sock = socket(AF_INET,SOCK_STREAM,0);

    server.sin_family=AF_INET;
    server.sin_port=htons(8080);
    server.sin_addr.s_addr =inet_addr("127.0.0.1");

    connect(sock,(struct sockaddr*)&server,sizeof(server));
    printf("Server connected!\n");

    while(1){
        printf("client:");
        fgets(msg,sizeof(msg),stdin);
        msg[strcspn(msg,"\n")] = 0;

        send(sock,msg,strlen(msg),0);
        if(strcmp(msg, "bye") == 0){
            printf("you ended the chat\n");
            break;
        }

        memset(buffer,0,sizeof(buffer));
        int bytes = recv(sock,buffer,sizeof(buffer)-1,0);
        if(bytes <= 0){
            printf("Server disconnected\n");
            break;
        }
        buffer[bytes] = '\0';
        printf("server: %s\n", buffer);
        if(strcmp(buffer, "bye") == 0) {
            printf("Server ended the chat.\n");
            break;
        }
    }

    closesocket(sock);
    WSACleanup();
    return 0;
}
