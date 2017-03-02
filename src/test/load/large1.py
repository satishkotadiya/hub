from locust import HttpLocust, TaskSet, task

from hubTasks import HubTasks
from hubUser import HubUser
from largeTasks import LargeTasks


# locust -f large.py --host=http://localhost:8080

class LargeUser1(HubUser):
    def name(self):
        return "large_test_1"

    def number(self, suggested):
        return 1

    def start_channel(self, payload, tasks):
        pass

    def start_webhook(self, config):
        pass

    def has_webhook(self):
        return False

    def has_websocket(self):
        return False


class LargeTasks1(TaskSet):
    hubTasks = None
    first = True

    def on_start(self):
        user_1 = LargeUser1()
        self.hubTasks = HubTasks(user_1, self.client)
        self.hubTasks.start()
        self.largeTasks = LargeTasks(user_1, self.hubTasks)

    @task(100)
    def write(self):
        self.largeTasks.write()


class WebsiteUser(HttpLocust):
    task_set = LargeTasks1
    min_wait = 5000
    max_wait = 30000

    def __init__(self):
        super(WebsiteUser, self).__init__()
        HubTasks.host = self.host
