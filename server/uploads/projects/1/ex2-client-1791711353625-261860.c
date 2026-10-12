#include <stdio.h>
#include <string.h>
#include <winsock2.h>

#pragma comment(lib, "ws2_32.lib")

int main() {
    WSADATA wsa;
    SOCKET sock;
    struct sockaddr_in server;

    char guessed[20];
    char drawing[100];
    char result[10];
    char guess;

    WSAStartup(MAKEWORD(2,2), &wsa);

    sock = socket(AF_INET, SOCK_STREAM, 0);

    server.sin_family = AF_INET;
    server.sin_port = htons(8080);
    server.sin_addr.s_addr = inet_addr("127.0.0.1");

    connect(sock, (struct sockaddr*)&server, sizeof(server));
while (1) {
    char buffer[200];

    // receive combined message
    recv(sock, buffer, sizeof(buffer), 0);
    printf("%s\n", buffer);

    printf("Enter a letter: ");
    scanf(" %c", &guess);

    send(sock, &guess, sizeof(guess), 0);

    // check win/lose
    recv(sock, buffer, sizeof(buffer), MSG_PEEK);

    if (strncmp(buffer, "WIN", 3) == 0) {
        recv(sock, buffer, sizeof(buffer), 0);
        printf("\n You won!!!\n");
        break;
    }
    else if (strncmp(buffer, "LOSE", 4) == 0) {
        recv(sock, buffer, sizeof(buffer), 0);
        printf("\n You lost!!!\n");
        break;
    }
}
    closesocket(sock);
    WSACleanup();

    return 0;
}